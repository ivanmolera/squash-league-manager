import { MobileViewFrame } from "@/app/view/mobile/view-frame";
import { getDictionary } from "@/src/lib/i18n";

export const dynamic = "force-dynamic";

export default async function MobileViewPage({ searchParams }: { searchParams?: Promise<{ path?: string }> }) {
  const { t } = await getDictionary();
  const requestedPath = (await searchParams)?.path ?? "/";
  const initialPath = requestedPath.startsWith("/") && !requestedPath.startsWith("//") && !requestedPath.startsWith("/view/mobile")
    ? requestedPath
    : "/";
  return <MobileViewFrame initialPath={initialPath} mobileLabel={t.mobileView} desktopLabel={t.desktopView} />;
}
