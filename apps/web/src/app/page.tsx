import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Constractor</h1>
      <p>Contractor management platform</p>
      <nav style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
        <Link href="/login">Login</Link>
        <Link href="/register">Register</Link>
      </nav>
    </main>
  );
}
