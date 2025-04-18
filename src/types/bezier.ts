export type Handle = { x: number; y: number };
export type BezierPoint = {
    id: string;
    x: number;
    y: number;
    handleLeft?: Handle;
    handleRight?: Handle;
};
export type Path = {
    id: string;
    points: BezierPoint[];
    closed: boolean;
};