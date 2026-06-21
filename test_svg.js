const wrapSvgBase64 = (imgBase64, size = 32) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><image href="${imgBase64}" width="${size}" height="${size}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};
console.log(wrapSvgBase64("data:image/png;base64,iVBORw0KGgo"));
