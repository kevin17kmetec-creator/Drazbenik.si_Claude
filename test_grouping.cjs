const items = [
  { id: 1, package_id: 'p1', title: { SLO: 'Item 1' } },
  { id: 2, package_id: 'p1', title: { SLO: 'Item 2' } },
  { id: 3, package_id: 'p2', title: { SLO: 'Item 3' } },
  { id: 4, package_id: null, title: { SLO: 'Item 4' } },
];
const grouped = [];
const packageMap = new Map();

items.forEach(item => {
  if (item.package_id) {
    if (!packageMap.has(item.package_id)) {
      packageMap.set(item.package_id, { type: 'package', package_id: item.package_id, items: [] });
    }
    packageMap.get(item.package_id).items.push(item);
  } else {
    grouped.push({ type: 'single', item });
  }
});

packageMap.forEach(pkg => {
  if (pkg.items.length >= 2) {
    grouped.push(pkg);
  } else if (pkg.items.length === 1) {
    grouped.push({ type: 'single', item: pkg.items[0] });
  }
});

console.log(grouped);
