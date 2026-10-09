const colors = ['#8ad4b1', '#b69af2', '#6ba8ed', '#e2ba7b', '#e397b2', '#74c7cc'];

// 每一条待连接的父节点占据一条泳道；分页边界上的线保留，不虚构根节点。
export function layoutGraph(commits) {
  let lanes = [], nextColor = 0, maxLanes = 1;
  const rows = commits.map(commit => {
    const before = lanes.map(l => ({ ...l }));
    let lane = lanes.findIndex(l => l.oid === commit.oid);
    const incoming = lane >= 0;
    if (lane < 0) { lane = lanes.length; lanes.push({ oid: commit.oid, color: colors[nextColor++ % colors.length] }); }
    const color = lanes[lane].color;
    lanes.splice(lane, 1);
    commit.parents.forEach((oid, index) => {
      if (!lanes.some(l => l.oid === oid)) lanes.splice(Math.min(lane + index, lanes.length), 0, { oid, color: index === 0 ? color : colors[nextColor++ % colors.length] });
    });
    const edges = before.filter(l => l.oid !== commit.oid).map(l => ({
      from: before.findIndex(b => b.oid === l.oid), to: lanes.findIndex(a => a.oid === l.oid), color: l.color, start: 0, end: 46,
    }));
    if (incoming) edges.push({ from: lane, to: lane, color, start: 0, end: 23 });
    commit.parents.forEach(oid => {
      const to = lanes.findIndex(l => l.oid === oid);
      edges.push({ from: lane, to, color: lanes[to].color, start: 23, end: 46 });
    });
    maxLanes = Math.max(maxLanes, before.length, lanes.length, lane + 1);
    return { lane, color, edges };
  });
  return { rows, width: Math.max(64, maxLanes * 18 + 24) };
}
