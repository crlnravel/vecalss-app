function packageReleaseLabel(versionNo: number) {
  return `Rilis ${versionNo}`;
}

function packageReleaseTitle(title: string, versionNo: number) {
  return `${title} · ${packageReleaseLabel(versionNo)}`;
}

export { packageReleaseLabel, packageReleaseTitle };
