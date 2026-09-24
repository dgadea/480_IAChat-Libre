import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMessageMethods } from './message';
import { createModels } from '../models';

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let getConversationImageFiles: ReturnType<typeof createMessageMethods>['getConversationImageFiles'];

const user = new mongoose.Types.ObjectId().toString();
const otherUser = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  Object.assign(mongoose.models, createModels(mongoose));
  await mongoose.connect(mongoServer.getUri());
  getConversationImageFiles = createMessageMethods(mongoose).getConversationImageFiles;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await mongoose.models.Message.deleteMany({});
  await mongoose.models.File.deleteMany({});
});

async function createFile(file_id: string, owner = user, type = 'image/png') {
  await mongoose.models.File.create({
    user: owner,
    file_id,
    filename: `${file_id}.png`,
    filepath: `https://r2.example.com/${file_id}.png`,
    type,
    bytes: 10,
    object: 'file',
    embedded: false,
    usage: 0,
    source: 's3',
  });
}

async function createMessage({
  conversationId,
  files,
  minutesAgo,
  owner = user,
  isCreatedByUser = true,
}: {
  conversationId: string;
  files: Array<{ file_id: string; type: string }>;
  minutesAgo: number;
  owner?: string;
  isCreatedByUser?: boolean;
}) {
  await mongoose.models.Message.create({
    messageId: uuidv4(),
    conversationId,
    user: owner,
    isCreatedByUser,
    text: 'hi',
    files,
    createdAt: new Date(Date.now() - minutesAgo * 60_000),
  });
}

describe('getConversationImageFiles', () => {
  it('returns the images the user attached, newest message first, up to the limit', async () => {
    const conversationId = uuidv4();
    await Promise.all(['old', 'mid', 'new', 'newest'].map((id) => createFile(id)));
    await createMessage({
      conversationId,
      minutesAgo: 30,
      files: [{ file_id: 'old', type: 'image/png' }],
    });
    await createMessage({
      conversationId,
      minutesAgo: 20,
      files: [
        { file_id: 'mid', type: 'image/png' },
        { file_id: 'new', type: 'image/png' },
      ],
    });
    await createMessage({
      conversationId,
      minutesAgo: 10,
      files: [{ file_id: 'newest', type: 'image/png' }],
    });

    const files = await getConversationImageFiles({ user, conversationId, limit: 3 });

    expect(files.map((file) => file.file_id)).toEqual(['newest', 'mid', 'new']);
    expect(files[0].source).toBe('s3');
  });

  it('ignores documents, assistant messages, other conversations and other users', async () => {
    const conversationId = uuidv4();
    await Promise.all([
      createFile('photo'),
      createFile('report', user, 'application/pdf'),
      createFile('generated'),
      createFile('elsewhere'),
      createFile('foreign', otherUser),
    ]);
    await createMessage({
      conversationId,
      minutesAgo: 5,
      files: [
        { file_id: 'photo', type: 'image/png' },
        { file_id: 'report', type: 'application/pdf' },
      ],
    });
    await createMessage({
      conversationId,
      minutesAgo: 4,
      isCreatedByUser: false,
      files: [{ file_id: 'generated', type: 'image/png' }],
    });
    await createMessage({
      conversationId: uuidv4(),
      minutesAgo: 3,
      files: [{ file_id: 'elsewhere', type: 'image/png' }],
    });
    await createMessage({
      conversationId,
      minutesAgo: 2,
      owner: otherUser,
      files: [{ file_id: 'foreign', type: 'image/png' }],
    });

    const files = await getConversationImageFiles({ user, conversationId, limit: 10 });

    expect(files.map((file) => file.file_id)).toEqual(['photo']);
  });

  it('drops a referenced file the user does not own', async () => {
    const conversationId = uuidv4();
    await createFile('borrowed', otherUser);
    await createMessage({
      conversationId,
      minutesAgo: 1,
      files: [{ file_id: 'borrowed', type: 'image/png' }],
    });

    await expect(getConversationImageFiles({ user, conversationId, limit: 4 })).resolves.toEqual(
      [],
    );
  });
});
