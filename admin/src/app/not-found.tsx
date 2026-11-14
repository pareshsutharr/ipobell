import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-[28px]">That page does not exist</h1>
        <p className="text-ink-3 mt-2">The IPO may have been removed from the feed, or the link is old.</p>
        <div className="mt-6 flex justify-center">
          <LinkButton href="/" variant="primary">
            Back to overview
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
