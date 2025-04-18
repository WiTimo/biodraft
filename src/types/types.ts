export type Handle = {
    x: number;
    y: number;
};

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
export type Mode = "DRAW" | "SELECT" | "FIT";

export type Link = { from: LinkSegment; to: LinkSegment };

export interface LinkSegment {
    pathId: string;
    a: { x: number; y: number };
    b: { x: number; y: number };
}