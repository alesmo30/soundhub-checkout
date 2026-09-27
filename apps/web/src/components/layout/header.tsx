import { Link } from 'react-router';

export function Header() {
  return (
    <header className="border-b border-border-subtle bg-surface">
      <div className="mx-auto flex max-w-content items-center px-4 py-4 md:px-8">
        <Link to="/" className="font-heading text-xl font-bold text-ink">
          SoundHub
        </Link>
      </div>
    </header>
  );
}
