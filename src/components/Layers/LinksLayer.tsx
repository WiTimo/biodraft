import React from "react";
import { Line } from "react-konva";
import { LinkSegment } from "../../types/types";

export interface Link {
    from: LinkSegment;
    to: LinkSegment;
}

interface LinksLayerProps {
    links: Link[];
}

export default React.memo(function LinksLayer({ links }: LinksLayerProps) {
    return (
        <>
            {links.map((link, i) => {
                // draw a connector between the midpoints of the two segments
                const fx = (link.from.a.x + link.from.b.x) / 2;
                const fy = (link.from.a.y + link.from.b.y) / 2;
                const tx = (link.to.a.x + link.to.b.x) / 2;
                const ty = (link.to.a.y + link.to.b.y) / 2;

                return (
                    <Line
                        key={`link-${i}`}
                        points={[fx, fy, tx, ty]}
                        stroke="red"
                        dash={[4, 4]}
                        strokeWidth={2}
                        listening={false}
                    />
                );
            })}
        </>
    );
});
