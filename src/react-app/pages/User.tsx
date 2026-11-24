import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import Head from "../components/Head";

type Entry = {
	value: number;
	rank: number;
	above: { name: string; value: number } | null;
};
type Profile = {
	uuid: string;
	name: string;
	skin: string | null;
	stats: Record<string, Record<string, Entry>>;
};

const CATEGORY_NAMES: Record<string, string> = {
	total: "Totals",
	custom: "General",
	mined: "Blocks mined",
	broken: "Items broken",
	crafted: "Items crafted",
	used: "Items used",
	picked_up: "Items picked up",
	dropped: "Items dropped",
	killed: "Mobs killed",
	killed_by: "Killed by mobs",
};

// These groups show first. Other groups follow in the order of the server.
const ORDER = ["total", "custom"];

const formatTicks = (ticks: number) => {
	const minutes = Math.floor(ticks / 20 / 60);
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const km = (cm: number) => `${(cm / 100000).toFixed(2)} km`;

function formatValue(category: string, key: string, value: number) {
	if (category === "total" && key === "distance") return km(value);
	if (category === "custom") {
		if (key.endsWith("_one_cm")) return km(value);
		if (key.includes("time") || key === "play_one_minute") return formatTicks(value);
		if (key.startsWith("damage_")) return (value / 10).toFixed(1);
	}
	return value.toLocaleString();
}

const pretty = (key: string) => {
	const text = key.replace(/_/g, " ");
	return text.charAt(0).toUpperCase() + text.slice(1);
};

function Rank({
	entry,
	category,
	statKey,
	player,
}: {
	entry: Entry;
	category: string;
	statKey: string;
	player: string;
}) {
	const [hover, setHover] = useState(false);
	const [pinned, setPinned] = useState(false);
	const ref = useRef<HTMLTableCellElement>(null);
	const show = hover || pinned;

	// A pinned box closes on a click outside of it or on Escape.
	useEffect(() => {
		if (!pinned) return;
		const onPointerDown = (e: MouseEvent) => {
			if (!ref.current?.contains(e.target as Node)) setPinned(false);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") setPinned(false);
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [pinned]);

	const medal = entry.rank <= 3 ? ` rank-${entry.rank}` : "";

	return (
		<td className="rank-cell" ref={ref}>
			<button
				type="button"
				className={`rank${medal}`}
				aria-expanded={show}
				onClick={() => setPinned((p) => !p)}
				onMouseEnter={() => setHover(true)}
				onMouseLeave={() => setHover(false)}
			>
				#{entry.rank} globally
			</button>
			{show && (
				<div className="rank-pop" role="tooltip">
					{entry.above ? (
						<>
							<div>
								Above {player}:{" "}
								<Link to={`/user/${encodeURIComponent(entry.above.name)}`}>
									{entry.above.name}
								</Link>
							</div>
							<div>
								{entry.above.name} has{" "}
								{formatValue(category, statKey, entry.above.value)}.
							</div>
							<div>
								Gap:{" "}
								{formatValue(category, statKey, entry.above.value - entry.value)}
							</div>
						</>
					) : (
						<div>No player is above {player}. This is the best value on the server.</div>
					)}
				</div>
			)}
		</td>
	);
}

function User() {
	const { name } = useParams();
	const [profile, setProfile] = useState<Profile | null>(null);
	const [status, setStatus] = useState<"loading" | "ok" | "missing" | "error">("loading");
    const [sortMode, setSortMode] = useState<"value" | "rank">("value");

	useEffect(() => {
		if (!name) return;
		let stale = false;

		fetch(`/api/users/${encodeURIComponent(name)}`)
			.then((res) => {
				if (res.status === 404) return null;
				if (!res.ok) throw new Error("Bad response");
				return res.json() as Promise<Profile>;
			})
			.then((data) => {
				if (stale) return;
				setProfile(data);
				setStatus(data ? "ok" : "missing");
			})
			.catch(() => {
				if (!stale) setStatus("error");
			});

		return () => {
			stale = true;
		};
	}, [name]);

	if (status === "loading") return <p>Loading player...</p>;
	if (status === "error") return <p>Player data is not available.</p>;
	if (status === "missing" || !profile) {
		return (
			<>
				<p>No player named {name} was found.</p>
				<Link to="/stats">Back to the leaderboard</Link>
			</>
		);
	}

	const categories = Object.keys(profile.stats).sort((a, b) => {
		const ia = ORDER.indexOf(a);
		const ib = ORDER.indexOf(b);
		return (ia === -1 ? ORDER.length : ia) - (ib === -1 ? ORDER.length : ib);
	});

	return (
		<>
			<div className="lb-player" style={{ justifyContent: "center" }}>
				<Head
					src={profile.skin ? `/api/skin/${profile.skin}` : `/api/head/${profile.uuid}`}
				/>
				<h1 className="lb-title">{profile.name}</h1>
			</div>
			<p>
				<Link to="/stats">Back to the leaderboard</Link>
			</p>

            <div className="user-sort">
				<button
					className={sortMode === "value" ? "active" : ""}
					onClick={() => setSortMode("value")}
				>
					Highest value
				</button>
				<button
					className={sortMode === "rank" ? "active" : ""}
					onClick={() => setSortMode("rank")}
				>
					Best rank
				</button>
			</div>

		    {categories.map((category) => {
				const entries = Object.entries(profile.stats[category]).sort(
					sortMode === "rank"
						? ([, a], [, b]) => a.rank - b.rank || b.value - a.value
						: ([, a], [, b]) => b.value - a.value,
				);
				return (
					<details key={category} open={ORDER.includes(category)}>
						<summary>
							{CATEGORY_NAMES[category] ?? pretty(category)} ({entries.length})
						</summary>
						<table className="lb user-table">
							<tbody>
								{entries.map(([key, entry]) => (
									<tr key={key}>
										<Rank
											entry={entry}
											category={category}
											statKey={key}
											player={profile.name}
										/>
										<td>{pretty(key)}</td>
										<td>{formatValue(category, key, entry.value)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</details>
				);
			})}
		</>
	);
}

export default User;