import { General } from './General';
import { HowCanWeHelp } from './HowCanWeHelp';
import { Inspiration } from './Inspiration';
import { ShareFeedback } from './ShareFeedback';

export const trays = {
  help: (props?: { slug?: string }) => <HowCanWeHelp slug={props?.slug} />,
  shareFeedback: (props?: { slug?: string }) => (
    <ShareFeedback slug={props?.slug} />
  ),
  inspiration: (props: { slug: string }) => <Inspiration slug={props.slug} />,
  general: () => <General />,
} as const;

export type Trays = typeof trays;
