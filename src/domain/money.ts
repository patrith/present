/** An amount in whole kronor as the UI writes it, e.g. "1 000 kr". */
export const kr = (n: number) => `${n.toLocaleString("sv-SE")} kr`;
