import { General } from './General';
import { HowCanWeHelp } from './HowCanWeHelp';
import { Inspiration } from './Inspiration';
import { ShareFeedback } from './ShareFeedback';

export const trays = {
  help: (props?: { slug?: string }) => <HowCanWeHelp slug={props?.slug} />,
  shareFeedback: () => <ShareFeedback />,
  inspiration: (props?: { slug?: string }) => (
    <Inspiration slug={props?.slug} />
  ),
  general: (props?: { slug?: string }) => <General slug={props?.slug} />,
} as const;

export type Trays = typeof trays;
