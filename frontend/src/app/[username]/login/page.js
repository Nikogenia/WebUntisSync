import Login from "./login";

export default async function Page({ params }) {
  return <Login params={await params} />;
}
