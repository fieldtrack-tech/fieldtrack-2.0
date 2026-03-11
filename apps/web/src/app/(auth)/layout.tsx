/**
 * Auth layout — intentionally bare.
 * Pages inside (auth) do not use AppLayout so the login screen is standalone.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
