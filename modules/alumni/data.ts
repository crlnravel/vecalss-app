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
  logoAlt: string;
  logoSrc: string;
  name: string;
  photoSrc: string;
  rank: number;
  university: string;
};

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

export { topAlumni };
export type { TopAlumni };
