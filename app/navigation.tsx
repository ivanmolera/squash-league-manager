import Link from "next/link";
import { setLocaleAction } from "@/app/actions";
import { getDictionary } from "@/src/lib/i18n";

export async function Navigation() {
  const { locale, t } = await getDictionary();

  return (
    <nav className="nav">
      <Link href="/">{t.app}</Link>
      <Link href="/dashboard">{t.dashboard}</Link>
      <Link href="/admin/players">{t.players}</Link>
      <Link href="/admin/clubs">{t.clubs}</Link>
      <Link href="/admin/leagues">{t.leagues}</Link>
      <Link href="/manager/tournaments">{t.tournaments}</Link>
      <form action={setLocaleAction} className="locale-form">
        <label>
          {t.language}
          <select name="locale" defaultValue={locale}>
            <option value="ca">CA</option>
            <option value="es">ES</option>
            <option value="en">EN</option>
          </select>
        </label>
        <button type="submit">OK</button>
      </form>
    </nav>
  );
}
