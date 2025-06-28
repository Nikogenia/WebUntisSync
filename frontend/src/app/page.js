import Landing from "./landing";

export default async function Page({ params }) {
  return <Landing params={await params} />;
}
