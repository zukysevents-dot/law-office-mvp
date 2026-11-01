import Link from "next/link";
import { Megaphone, Pin } from "lucide-react";

import { Section } from "@/components/section";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatDateTime } from "@/lib/format";
import { officeWorkDate } from "@/lib/hr/attendance-calc";
import { activeNewsWhere } from "@/lib/hr/news";
import { andWhere, hrNewsTargetWhere } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

const WIDGET_LIMIT = 5;

type WidgetNews = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: Date;
  createdBy: { name: string } | null;
};

// Dashboard widget „Aktuality“: platné aktuality URČENÉ přihlášenému
// uživateli (celá kancelář, jeho role, nebo on jako příjemce). Dashboard ho
// vykreslí jen s přístupem k modulu HR (dashboardWidgetModule).
export async function HrNewsWidget({ title }: { title: string }) {
  const result = await safeQuery<WidgetNews[]>([], async () => {
    const currentUser = await getCurrentUser();
    return getPrisma().hrNews.findMany({
      where: andWhere(
        activeNewsWhere(officeWorkDate(new Date())),
        hrNewsTargetWhere(currentUser),
      ),
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: WIDGET_LIMIT,
      select: {
        id: true,
        title: true,
        body: true,
        pinned: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
    });
  });
  const news = result.data ?? [];

  return (
    <Section title={title} data-widget="hr-news">
      <div className="mb-3 flex justify-end">
        <ButtonLink href="/hr/news" variant="ghost" className="h-8 px-3">
          Všechny aktuality
        </ButtonLink>
      </div>
      {news.length > 0 ? (
        <ul className="grid gap-2">
          {news.map((item) => (
            <li
              key={item.id}
              className="min-w-0 rounded-md border border-[#dce4e8] bg-[#F4F7F8]/55 p-3"
              data-testid="hr-news-widget-item"
            >
              <Link href="/hr/news" className="flex min-w-0 items-start gap-3">
                {item.pinned ? (
                  <Pin className="mt-0.5 h-4 w-4 shrink-0 text-[#17A2A2]" aria-label="Připnuto" />
                ) : (
                  <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-[#0e1822]" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium text-[#0e1822]">
                    {item.title}
                  </span>
                  <span className="mt-1 line-clamp-3 whitespace-pre-line break-words text-sm text-[#0e1822]">
                    {item.body}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-2 text-xs text-[#566673]">
                    <span>{formatDateTime(item.createdAt)}</span>
                    {item.createdBy ? <span>{item.createdBy.name}</span> : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>Žádné aktuální oznámení.</EmptyState>
      )}
    </Section>
  );
}
