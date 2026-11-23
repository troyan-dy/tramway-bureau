export function busiestTrips(game) {
  const trips = new Map();
  for (const {origin, dest} of game.people) {
    const key = origin * game.sites.length + dest;
    const trip = trips.get(key) || {origin, dest, count: 0};
    trip.count++;
    trips.set(key, trip);
  }
  return [...trips.values()].sort((a, b) =>
    b.count - a.count || a.origin - b.origin || a.dest - b.dest
  ).slice(0, 3);
}

export function nextShiftAdvice(game) {
  const {stats, lines} = game;
  const inService = lines.filter(line => line.trams > 0);
  if (game.won) {
    return 'Попробуйте превзойти свой результат на этой карте с другой схемой линий.';
  }
  if (game.fare === 3 && stats.byReason.expensive > 0) {
    return 'Часть жителей сочла билет дорогим. В следующей смене попробуйте тариф 2 ₽ на той же сети.';
  }
  if (!inService.some(line => line.stops.includes(2))) {
    return 'Подведите действующую линию к вокзалу, чтобы забрать утренний поток.';
  }
  if (lines.some(line => line.stops.length && !line.trams)) {
    return 'На одной из проложенных линий нет вагонов. Выпустите вагон, чтобы открыть движение.';
  }
  if (stats.byReason.crowded > 0) {
    return 'На остановках некоторым жителям не хватило мест. Усильте линию, где очередь остаётся после отправления вагона.';
  }
  if (stats.byReason.waiting > 0 || stats.byReason.legacyWait > 0) {
    return 'Часть жителей не дождалась поездки. Более короткая линия или дополнительный вагон уменьшат интервал.';
  }
  if (stats.byReason.unconnected > 0) {
    return 'Части жителей не подошли действующие линии. В слое «Потоки» найдите направление за пределами сети и свяжите его с общей остановкой.';
  }
  return 'Сравните самые частые направления в слое «Потоки» с трассой линии. Более прямой маршрут уменьшит время поездки.';
}

export function districtOrder(game) {
  const id = game.brief.site;
  const delivered = game.stats.bySite[id].tram;
  const target = 8;
  return {name:game.sites[id].name, delivered, target, done:delivered >= target};
}
