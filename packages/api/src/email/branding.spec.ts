import { resolveEmailLogoUrl } from './branding';

describe('resolveEmailLogoUrl', () => {
  it('serves the logo from the client domain', () => {
    expect(resolveEmailLogoUrl({ DOMAIN_CLIENT: 'https://chat.example.com/' })).toBe(
      'https://chat.example.com/assets/logo.png',
    );
  });

  it('prefers an explicit logo URL', () => {
    expect(
      resolveEmailLogoUrl({
        EMAIL_LOGO_URL: 'https://cdn.example.com/brand.png',
        DOMAIN_CLIENT: 'https://chat.example.com',
      }),
    ).toBe('https://cdn.example.com/brand.png');
  });

  it('omits the logo when no domain is known', () => {
    expect(resolveEmailLogoUrl({})).toBeUndefined();
    expect(resolveEmailLogoUrl({ DOMAIN_CLIENT: '  ' })).toBeUndefined();
  });
});
