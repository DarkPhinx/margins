import { Link } from 'react-router-dom';

/** A home section's heading, linking to its full page. */
export function SectionHeading({ title, to }: { title: string; to: string }) {
  return (
    <div className="home-section-head">
      <h2>
        <Link to={to}>{title}</Link>
      </h2>
    </div>
  );
}
