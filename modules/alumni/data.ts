const alumniNames = [
  "Alya Nadhira",
  "Raka Pradipta",
  "Nayla Safira",
  "Dimas Arya",
  "Kirana Aulia",
  "Farel Mahendra",
  "Zahra Putri",
  "Naufal Ramadhan",
  "Anindya Laras",
  "Bima Alfarezi",
  "Rania Calista",
  "Rafi Akbar",
  "Mikayla Jasmine",
  "Arkan Wijaya",
  "Citra Maharani",
  "Gilang Pratama",
  "Keisha Amara",
  "Farhan Aditya",
  "Salsabila Qonita",
  "Reno Bagaskara",
  "Tasya Hanum",
  "Irfan Maulana",
  "Aurelia Kinanti",
  "Rizky Al Ghifari",
  "Maira Zhafira",
  "Hafiz Alfarizi",
  "Naura Khairunnisa",
  "Adrian Wicaksono",
  "Shafira Amanda",
  "Yusuf Fadhil",
];

const targetUniversities = [
  {
    logoAlt: "Universitas Indonesia mark",
    logoSrc: "/brand/campuses/ui.png",
    name: "Universitas Indonesia",
  },
  {
    logoAlt: "Universitas Gadjah Mada mark",
    logoSrc: "/brand/campuses/ugm.png",
    name: "Universitas Gadjah Mada",
  },
  {
    logoAlt: "Institut Teknologi Bandung mark",
    logoSrc: "/brand/campuses/itb.svg",
    name: "Institut Teknologi Bandung",
  },
  {
    logoAlt: "Universitas Airlangga mark",
    logoSrc: "/brand/campuses/unair.png",
    name: "Universitas Airlangga",
  },
  {
    logoAlt: "Universitas Padjadjaran mark",
    logoSrc: "/brand/campuses/unpad.png",
    name: "Universitas Padjadjaran",
  },
  {
    logoAlt: "UPN Veteran Jakarta mark",
    logoSrc: "/brand/campuses/upn.png",
    name: "UPN Veteran Jakarta",
  },
];

const avatarPlaceholder = "/landing-assets/avatar-placeholder.png";

type TopAlumni = {
  id: string;
  isPlaceholder?: boolean;
  logoAlt?: string;
  logoSrc?: string;
  name: string;
  photoSrc: string;
  rank: number;
  university: string;
};

const baseFeaturedTopAlumni: TopAlumni[] = [
  {
    id: "featured-top-alumni-1",
    logoAlt: "Institut Teknologi Sepuluh Nopember seal",
    logoSrc: "/brand/campuses/its.svg",
    name: "Zahra Margareta Sulistyo Putri",
    photoSrc: "/landing-assets/top-6/Rara.jpg",
    rank: 1,
    university: "Sistem Informasi ITS",
  },
  {
    id: "featured-top-alumni-2",
    logoAlt: "Universitas Padjadjaran mark",
    logoSrc: "/brand/campuses/unpad.png",
    name: "Ayesha Zahra Khairunnisa",
    photoSrc: "/landing-assets/top-6/Ayesha.jpg",
    rank: 2,
    university: "Kedokteran UNPAD",
  },
  {
    id: "featured-top-alumni-3",
    logoAlt: "Institut Teknologi Sepuluh Nopember seal",
    logoSrc: "/brand/campuses/its.svg",
    name: "Decky Lorenzo Akbar",
    photoSrc: "/landing-assets/top-6/Decky.jpg",
    rank: 3,
    university: "Teknik Lepas Pantai ITS",
  },
  {
    id: "featured-top-alumni-4",
    logoAlt: "Universitas Indonesia mark",
    logoSrc: "/brand/campuses/ui.png",
    name: "Sheren Amalia",
    photoSrc: "/landing-assets/top-6/Sheren.jpg",
    rank: 4,
    university: "Geologi UI",
  },
  {
    id: "featured-top-alumni-5",
    logoAlt: "Institut Teknologi Bandung mark",
    logoSrc: "/brand/campuses/itb.svg",
    name: "Sabrina Dewi Anggraeni",
    photoSrc: "/landing-assets/top-6/Bina.jpg",
    rank: 5,
    university: "Sekolah Farmasi ITB",
  },
  {
    id: "featured-top-alumni-6",
    logoAlt: "Universitas Padjadjaran mark",
    logoSrc: "/brand/campuses/unpad.png",
    name: "Audrey Cynthia Bukit",
    photoSrc: "/landing-assets/top-6/Audrey.jpg",
    rank: 6,
    university: "Teknologi Pangan UNPAD",
  },
];

const homepagePlaceholderTopAlumni: TopAlumni[] = [
  {
    id: "featured-top-alumni-7",
    logoAlt: "Universitas Indonesia mark",
    logoSrc: "/brand/campuses/ui.png",
    name: "Lintang",
    photoSrc: "/landing-assets/top-20-extra/Lintang.jpg",
    rank: 7,
    university: "Arsitektur UI",
  },
  {
    id: "featured-top-alumni-8",
    logoAlt: "Institut Teknologi Sepuluh Nopember seal",
    logoSrc: "/brand/campuses/its.svg",
    name: "Rafi Adiwitya Ardana Shafwan",
    photoSrc: "/landing-assets/top-20-extra/Rafi.jpg",
    rank: 8,
    university: "Teknik Telekomunikasi ITS",
  },
  {
    id: "featured-top-alumni-9",
    logoAlt: "Universitas Airlangga mark",
    logoSrc: "/brand/campuses/unair.png",
    name: "Nurzaki Arfiansyah",
    photoSrc: "/landing-assets/top-20-extra/Nurzaki.jpg",
    rank: 9,
    university: "Teknik Elektro UNAIR",
  },
  {
    id: "featured-top-alumni-10",
    name: "Raihania Ruchlianti",
    photoSrc: "/landing-assets/top-20-extra/Raihania.jpg",
    rank: 10,
    university: "Arsitektur UPI",
  },
  {
    id: "featured-top-alumni-11",
    name: "Suci Oktavia",
    photoSrc: "/landing-assets/top-20-extra/Suci.jpg",
    rank: 11,
    university: "Bahasa dan Sastra Indonesia UPI",
  },
  {
    id: "featured-top-alumni-12",
    name: "Muhammad Zahran Nasir",
    photoSrc: "/landing-assets/top-20-extra/Zahran.jpg",
    rank: 12,
    university: "Ilmu Hukum Universitas Jambi",
  },
  {
    id: "featured-top-alumni-13",
    name: "Asyraf Arrahman",
    photoSrc: "/landing-assets/top-20-extra/asyraf.jpg",
    rank: 13,
    university: "Statistika dan Sains Data IPB",
  },
  {
    id: "featured-top-alumni-14",
    logoAlt: "Universitas Airlangga mark",
    logoSrc: "/brand/campuses/unair.png",
    name: "Ficky Rizki Wahyudi",
    photoSrc: "/landing-assets/top-20-extra/ficky.jpg",
    rank: 14,
    university: "Manajemen UNAIR",
  },
  {
    id: "featured-top-alumni-15",
    logoAlt: "Universitas Airlangga mark",
    logoSrc: "/brand/campuses/unair.png",
    name: "Naila Wulidatul Afid",
    photoSrc: "/landing-assets/top-20-extra/naila.jpg",
    rank: 15,
    university: "Sosiologi UNAIR",
  },
  {
    id: "featured-top-alumni-16",
    name: "Rayva Angeline Blissfully Tambunan",
    photoSrc: "/landing-assets/top-20-extra/rayva.jpg",
    rank: 16,
    university: "Administrasi Bisnis UB",
  },
  {
    id: "featured-top-alumni-17",
    name: "Syafa Elisa",
    photoSrc: "/landing-assets/top-20-extra/syafa.jpg",
    rank: 17,
    university: "Sastra Inggris UB",
  },
  {
    id: "featured-top-alumni-18",
    name: "May Alifia Santoso",
    photoSrc: "/landing-assets/top-20-extra/may.jpg",
    rank: 18,
    university: "Teknik Metalurgi UNESA",
  },
  {
    id: "featured-top-alumni-19",
    name: "Tiara Denisa Putri",
    photoSrc: "/landing-assets/top-20-extra/tiara.jpg",
    rank: 19,
    university: "Psikologi Universitas Andalas",
  },
  {
    id: "featured-top-alumni-20",
    logoAlt: "Universitas Indonesia mark",
    logoSrc: "/brand/campuses/ui.png",
    name: "Adam Housen Arpando",
    photoSrc: "/landing-assets/top-20-extra/ocen.jpg",
    rank: 20,
    university: "Administrasi Perkantoran UI",
  },
];

const featuredTopAlumni: TopAlumni[] = [
  ...baseFeaturedTopAlumni,
  ...homepagePlaceholderTopAlumni,
];

const topAlumni: TopAlumni[] = Array.from({ length: 90 }, (_, index) => {
  const round = Math.floor(index / alumniNames.length);
  const name = alumniNames[index % alumniNames.length];
  const university = targetUniversities[index % targetUniversities.length];

  return {
    id: `top-alumni-${index + 1}`,
    logoAlt: university.logoAlt,
    logoSrc: university.logoSrc,
    name: round === 0 ? name : `${name} ${round + 1}`,
    photoSrc: avatarPlaceholder,
    rank: index + 1,
    university: university.name,
  };
});

export { featuredTopAlumni, topAlumni };
export type { TopAlumni };
