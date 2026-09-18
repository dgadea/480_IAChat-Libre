import { useMemo, useState, useCallback, memo } from 'react';
import type { TFile, TMessage } from 'librechat-data-provider';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import { usesImagePreview, hydrateFileDeliveryMetadata } from '~/utils';
import { useFileMapContext, useShareContext } from '~/Providers';
import FilePreviewDialog from './FilePreviewDialog';
import { useLocalize } from '~/hooks';
import Image from './Image';

/** Generated clips arrive as ordinary attachments; played inline they read as
 *  part of the answer rather than a file to go open. */
const isVideoFile = (file: Partial<TFile>): boolean => file.type?.startsWith('video/') === true;

const Files = ({ message }: { message?: TMessage }) => {
  const localize = useLocalize();
  const fileMap = useFileMapContext();
  const { shareId } = useShareContext();
  const files = useMemo(
    () => hydrateFileDeliveryMetadata(message?.files, undefined, shareId ? undefined : fileMap),
    [message?.files, fileMap, shareId],
  );
  const imageFiles = useMemo(() => {
    return files?.filter(usesImagePreview) || [];
  }, [files]);

  const videoFiles = useMemo(() => {
    return files?.filter(isVideoFile) || [];
  }, [files]);

  const otherFiles = useMemo(() => {
    return files?.filter((file) => !usesImagePreview(file) && !isVideoFile(file)) || [];
  }, [files]);

  const [selectedFile, setSelectedFile] = useState<Partial<TFile> | null>(null);

  const handleClose = useCallback((open: boolean) => {
    if (!open) {
      setSelectedFile(null);
    }
  }, []);

  return (
    <>
      {otherFiles.length > 0 &&
        otherFiles.map((file) => (
          <FileContainer
            key={file.file_id}
            file={file as TFile}
            onClick={() => setSelectedFile(file)}
          />
        ))}
      {videoFiles.length > 0 &&
        videoFiles.map((file) => (
          /* The provider returns audio but no caption track, and a decorative
             empty <track> would claim captions exist. */
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            key={file.file_id}
            controls
            preload="metadata"
            src={file.preview ?? file.filepath ?? ''}
            className="my-2 h-auto w-full max-w-lg rounded-lg"
            aria-label={file.filename ?? localize('com_ui_generated_video')}
          />
        ))}
      {imageFiles.length > 0 &&
        imageFiles.map((file) => (
          <Image
            key={file.file_id}
            imagePath={file.preview ?? file.filepath ?? ''}
            height={file.height ?? 1920}
            width={file.width ?? 1080}
            altText={file.filename ?? 'Uploaded Image'}
          />
        ))}
      <FilePreviewDialog
        open={selectedFile !== null}
        onOpenChange={handleClose}
        fileName={selectedFile?.filename ?? ''}
        fileId={selectedFile?.file_id}
        filePath={selectedFile?.filepath}
        fileType={selectedFile?.type ?? undefined}
        fileSource={selectedFile?.source}
        fileSize={(selectedFile as TFile)?.bytes}
        deliveryPath={selectedFile?.llmDeliveryPath}
      />
    </>
  );
};

export default memo(Files);
