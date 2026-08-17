import AmygdalaApp from "../AmygdalaApp";

export default async function RoutedAmygdala({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <AmygdalaApp initialPath={`/${slug.join("/")}`} />;
}
