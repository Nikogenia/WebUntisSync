import Dashboard from './dashboard';

export default async function Page({ params }) {
  return <Dashboard params={await params} />;
}
