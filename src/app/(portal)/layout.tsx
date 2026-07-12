export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#portal-main-content"
        className="fixed left-4 top-3 z-50 -translate-y-20 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#072924] shadow-lg transition focus:translate-y-0"
      >
        Přeskočit na obsah
      </a>
      {children}
    </>
  );
}
