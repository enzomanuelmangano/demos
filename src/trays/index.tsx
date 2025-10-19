import { HowCanWeHelp } from './HowCanWeHelp';
import { Inspiration } from './Inspiration';
import { ShareFeedback } from './ShareFeedback';

export const trays = {
  howCanWeHelp: (props?: { slug?: string }) => (
    <HowCanWeHelp slug={props?.slug} />
  ),
  shareFeedback: () => <ShareFeedback />,
  inspiration: (props?: { slug?: string }) => (
    <Inspiration slug={props?.slug} />
  ),
} as const;

export type Trays = typeof trays;
