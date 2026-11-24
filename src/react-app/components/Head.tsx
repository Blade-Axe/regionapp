import { useEffect, useRef } from "react";

function Head({ src }: { src: string | null }) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const ctx = ref.current?.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, 8, 8);
		if (!src) return;
		const image = new Image();
		image.onload = () => {
			ctx.imageSmoothingEnabled = false;
			ctx.clearRect(0, 0, 8, 8);
			ctx.drawImage(image, 8, 8, 8, 8, 0, 0, 8, 8);
			// Old skins (64 x 32) have no hat layer.
			if (image.height >= 64) ctx.drawImage(image, 40, 8, 8, 8, 0, 0, 8, 8);
		};
		image.src = src;
		return () => {
			image.onload = null;
		};
	}, [src]);

	return <canvas ref={ref} className="head" width={8} height={8} aria-hidden="true" />;
}

export default Head;