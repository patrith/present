/** An amount in whole kronor as Swedish text, e.g. "1 000 kr". */
export const kronor = (n: number) => `${n.toLocaleString("sv-SE")} kr`;
