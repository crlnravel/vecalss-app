import { BookOpen, CalendarCheck, MessageCircle } from "@/lib/icons";

import type { StudentNotificationItem } from "@/modules/student/components/student-notification-popover";

const studentNotificationItems: StudentNotificationItem[] = [
  {
    detail: "PU modul 04 direkomendasikan ulang setelah tryout terakhir.",
    href: "/dashboard",
    icon: BookOpen,
    time: "Baru saja",
    title: "Fokus belajarmu diperbarui",
    unread: true,
  },
  {
    detail: "Mentoring strategi SNBT dimulai hari ini pukul 19.00 WIB.",
    href: "/dashboard",
    icon: CalendarCheck,
    time: "Hari ini",
    title: "Kelas live malam ini",
    unread: true,
  },
  {
    detail: "Vera AI menyiapkan rangkuman kelemahan dan 5 soal lanjutan.",
    href: "/dashboard",
    icon: MessageCircle,
    time: "Kemarin",
    title: "Balasan baru dari Vera AI",
    unread: false,
  },
];

export { studentNotificationItems };
