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

const featuredTopAlumni: TopAlumni[] = [
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

const placeholderTopAlumni: TopAlumni[] = Array.from(
  { length: 20 - featuredTopAlumni.length },
  (_, index) => {
    const name = alumniNames[index % alumniNames.length];
    const university = targetUniversities[index % targetUniversities.length];

    return {
      id: `top-alumni-placeholder-${index + 1}`,
      isPlaceholder: true,
      logoAlt: university.logoAlt,
      logoSrc: university.logoSrc,
      name,
      photoSrc: avatarPlaceholder,
      rank: featuredTopAlumni.length + index + 1,
      university: `${university.name} placeholder`,
    };
  },
);

const topAlumni: TopAlumni[] = [...featuredTopAlumni, ...placeholderTopAlumni];

export { featuredTopAlumni, topAlumni };
export type { TopAlumni };
