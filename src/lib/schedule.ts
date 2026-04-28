export function shuffle<T>(items: T[]) {
  const output = [...items];

  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [output[index], output[target]] = [output[target], output[index]];
  }

  return output;
}

export function generateRoundRobin<T>(items: T[]) {
  const competitors: Array<T | null> = [...items];
  const hasBye = competitors.length % 2 === 1;

  if (hasBye) {
    competitors.push(null);
  }

  const rounds: Array<Array<[T, T]>> = [];
  const rotating = competitors as Array<T | null>;
  const roundCount = rotating.length - 1;
  const matchesPerRound = rotating.length / 2;

  for (let round = 0; round < roundCount; round += 1) {
    const matches: Array<[T, T]> = [];

    for (let match = 0; match < matchesPerRound; match += 1) {
      const home = rotating[match];
      const away = rotating[rotating.length - 1 - match];

      if (home && away) {
        matches.push(round % 2 === 0 ? [home, away] : [away, home]);
      }
    }

    rounds.push(matches);
    rotating.splice(1, 0, rotating.pop() ?? null);
  }

  return rounds;
}

export function nextPowerOfTwo(value: number) {
  return 2 ** Math.ceil(Math.log2(Math.max(value, 2)));
}
