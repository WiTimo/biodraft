import React from "react";
import { Line, Text } from "react-konva";
import { Link } from "../../types/types";
import { Path as PathType } from "../../types/bezier";

interface LinksLayerProps { paths: PathType[]; links: Link[]; }

export default React.memo(function LinksLayer({ paths, links }: LinksLayerProps) {
    const centroids = Object.fromEntries(
        paths.map(p => {
            const xs = p.points.map(pt => pt.x), ys = p.points.map(pt => pt.y);
            return [
                p.id,
                {
                    x: xs.reduce((a, b) => a + b, 0) / xs.length,
                    y: ys.reduce((a, b) => a + b, 0) / ys.length
                }
            ];
        })
    );

    return (
        <>
            {links.map((l, i) => {
                const a = centroids[l.a], b = centroids[l.b];
                if (!a || !b) return null;
                return (
                    <React.Fragment key={`link-${i}`}>
                        <Line
                            points={[a.x, a.y, b.x, b.y]}
                            stroke="red"
                            dash={[4, 4]}
                            strokeWidth={2}
                        />
                        <Text
                            x={(a.x + b.x) / 2}
                            y={(a.y + b.y) / 2}
                            text={`${i + 1}`}
                            fontSize={14}
                            fill="red"
                        />
                    </React.Fragment>
                );
            })}
        </>
    );
});
