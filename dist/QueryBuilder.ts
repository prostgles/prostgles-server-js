
export type Query = {
    table: string;
    select: string[];
    where: object;
    limit: number;
    offset: number;
    orderBy: { [key: string]: boolean }[];
};

export type JoinQuery = {
    table: string

}

export const makeJoin = (): string  =>{
    let result = "";

    return result;
}