import { useHref } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Label, Button } from '@librechat/client';
import { useLocalize } from '~/hooks';

/** Opens the admin Usage page in its own tab, so the settings dialog stays where it was */
export default function UsageLink() {
  const localize = useLocalize();
  const href = useHref('/usage');

  return (
    <div className="flex items-center justify-between">
      <Label id="usage-page-label">{localize('com_usage_title')}</Label>
      <Button asChild variant="outline" aria-labelledby="usage-page-label">
        <a href={href} target="_blank" rel="noopener noreferrer">
          {localize('com_ui_open_var', { 0: localize('com_usage_title') })}
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      </Button>
    </div>
  );
}
