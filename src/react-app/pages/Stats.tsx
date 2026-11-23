import { Fragment, useEffect, useState } from "react";
import Head from "../components/Head";

type Kind = "time" | "distance" | "tenths" | "count";
type Meta = { key: string; label: string; group: string; kind: Kind };
type Row = { uuid: string; name: string; skin: string | null; values: number[] };
type Board = { columns: Meta[]; sort: string; rows: Row[] };
type Detail = { name: string; stats: Record<string, Record<string, number>> };
type PickerTarget = { index: number | null };

const STORAGE_KEY = "lb-columns";
const MAX_COLUMNS = 5;

const CATEGORY_NAMES: Record<string, string> = {
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

const formatTicks = (ticks: number) => {
	const minutes = Math.floor(ticks / 20 / 60);
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const pretty = (key: string) =>
	key.replace(/^minecraft:/, "").replace(/_/g, " ");

function formatMetric(kind: Kind, value: number) {
	if (kind === "time") return formatTicks(value);
	if (kind === "distance") return `${(value / 100000).toFixed(2)} km`;
	if (kind === "tenths") return (value / 10).toFixed(1);
	return value.toLocaleString();
}

// Used in the player detail view. Only the "custom" group has special units.
function formatDetail(category: string, key: string, value: number) {
	if (category === "custom") {
		if (key.endsWith("_one_cm")) return `${(value / 100000).toFixed(2)} km`;
		if (key.includes("time") || key === "play_one_minute") {
			return formatTicks(value);
		}
		if (key.startsWith("damage_")) return (value / 10).toFixed(1);
	}
	return value.toLocaleString();
}

function loadColumns(): string[] | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : null;
		if (Array.isArray(parsed) && parsed.every((k) => typeof k === "string")) {
			return parsed as string[];
		}
	} catch {
		// Storage is not available. Use the default columns.
	}
	return null;
}

function Picker({
	title,
	onPick,
	onClose,
}: {
	title: string;
	onPick: (key: string) => void;
	onClose: () => void;
}) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<Meta[]>([]);

	useEffect(() => {
		const timer = setTimeout(() => {
			fetch(`/api/stats/search?q=${encodeURIComponent(query)}`)
				.then((res) => res.json() as Promise<{ results: Meta[] }>)
				.then((data) => setResults(data.results))
				.catch(() => setResults([]));
		}, 250);
		return () => clearTimeout(timer);
	}, [query]);

	return (
		<div className="lb-picker">
			<div className="lb-picker-head">
				<strong>{title}</strong>
				<button onClick={onClose}>Close</button>
			</div>
			<input
				type="search"
				autoFocus
				placeholder="Search: diamond, zombie, crafted, jump..."
				value={query}
				onChange={(e) => setQuery(e.target.value)}
			/>
			<ul className="lb-results">
				{results.map((m) => (
					<li key={m.key}>
						<button onClick={() => onPick(m.key)}>
							<span>{m.label}</span>
							<span className="lb-group">{m.group}</span>
						</button>
					</li>
				))}
			</ul>
			{query !== "" && results.length >= 50 && (
				<p className="lb-group">Only the first 50 results show. Type more to narrow them.</p>
			)}
			{query !== "" && results.length === 0 && (
				<p className="lb-group">No statistic found.</p>
			)}
		</div>
	);
}

function Stats() {
	const [custom, setCustom] = useState<string[] | null>(loadColumns);
	const [sort, setSort] = useState<string | null>(null);
	const [board, setBoard] = useState<Board | null>(null);
	const [error, setError] = useState(false);
	const [picker, setPicker] = useState<PickerTarget | null>(null);
	const [open, setOpen] = useState<string | null>(null);
	const [detail, setDetail] = useState<Detail | null>(null);

	useEffect(() => {
		const params = new URLSearchParams();
		if (custom) params.set("columns", custom.join(","));
		if (sort) params.set("sort", sort);

		fetch(`/api/leaderboard?${params.toString()}`)
			.then((res) => {
				if (!res.ok) throw new Error("Bad response");
				return res.json() as Promise<Board>;
			})
			.then((data) => {
				setBoard(data);
				setError(false);
			})
			.catch(() => setError(true));
	}, [custom, sort]);

	const updateColumns = (next: string[] | null) => {
		try {
			if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
			else localStorage.removeItem(STORAGE_KEY);
		} catch {
			// Storage is not available. The choice lasts until the page closes.
		}
		if (!next || (sort && !next.includes(sort))) setSort(null);
		setCustom(next);
	};

	const pick = (key: string) => {
		if (board && picker) {
			const current = board.columns.map((c) => c.key);
			if (!current.includes(key)) {
				updateColumns(
					picker.index === null
						? [...current, key]
						: current.map((k, i) => (i === picker.index ? key : k)),
				);
			}
		}
		setPicker(null);
	};

	const remove = (index: number) => {
		if (!board) return;
		updateColumns(board.columns.map((c) => c.key).filter((_, i) => i !== index));
	};

	const toggle = (uuid: string) => {
		if (open === uuid) {
			setOpen(null);
			return;
		}
		setOpen(uuid);
		setDetail(null);
		fetch(`/api/players/${uuid}`)
			.then((res) => {
				if (!res.ok) throw new Error("Bad response");
				return res.json() as Promise<Detail>;
			})
			.then(setDetail)
			.catch(() => setOpen(null));
	};

	if (error && !board) return <p>Leaderboard is not available.</p>;
	if (!board) return <p>Loading leaderboard...</p>;

	return (
		<>
			<h1 className="lb-title">Leaderboard</h1>

			<div className="lb-actions">
				<button
					onClick={() => setPicker({ index: null })}
					disabled={board.columns.length >= MAX_COLUMNS}
				>
					Add column
				</button>
				<button onClick={() => updateColumns(null)} disabled={custom === null}>
					Reset columns
				</button>
			</div>

			{picker && (
				<Picker
					title={
						picker.index === null
							? "Add a column"
							: `Change "${board.columns[picker.index]?.label ?? "column"}"`
					}
					onPick={pick}
					onClose={() => setPicker(null)}
				/>
			)}

			{board.rows.length === 0 ? (
				<p>No player data yet.</p>
			) : (
				<div className="lb-wrap">
					<table className="lb">
						<thead>
							<tr>
								<th>#</th>
								<th>Player</th>
								{board.columns.map((col, i) => (
									<th key={col.key}>
										<button
											className={`lb-sort${board.sort === col.key ? " active" : ""}`}
											onClick={() => setSort(col.key)}
										>
											{col.label}
										</button>
										<button
											className="lb-tool"
											aria-label={`Change ${col.label}`}
											onClick={() => setPicker({ index: i })}
										>
											Edit
										</button>
										{board.columns.length > 1 && (
											<button
												className="lb-tool"
												aria-label={`Remove ${col.label}`}
												onClick={() => remove(i)}
											>
												×
											</button>
										)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{board.rows.map((row, index) => (
								<Fragment key={row.uuid}>
									<tr>
										<td>{index + 1}</td>
										<td>
											<div className="lb-player">
												<Head src={row.skin ? `/api/skin/${row.skin}` : `/api/head/${row.uuid}`} />
												<button className="lb-name" onClick={() => toggle(row.uuid)}>
													{row.name}
												</button>
											</div>
										</td>
										{row.values.map((value, i) => (
											<td key={board.columns[i].key}>
												{formatMetric(board.columns[i].kind, value)}
											</td>
										))}
									</tr>
									{open === row.uuid && (
										<tr>
											<td colSpan={board.columns.length + 2} className="lb-detail">
												{!detail
													? "Loading..."
													: Object.entries(detail.stats).map(([category, entries]) => (
															<details key={category}>
																<summary>
																	{CATEGORY_NAMES[category] ?? pretty(category)} (
																	{Object.keys(entries).length})
																</summary>
																<table className="lb-inner">
																	<tbody>
																		{Object.entries(entries)
																			.sort(([, a], [, b]) => b - a)
																			.map(([key, value]) => (
																				<tr key={key}>
																					<td>{pretty(key)}</td>
																					<td>{formatDetail(category, key, value)}</td>
																				</tr>
																			))}
																	</tbody>
																</table>
															</details>
														))}
											</td>
										</tr>
									)}
								</Fragment>
							))}
						</tbody>
					</table>
				</div>
			)}
		</>
	);
}

export default Stats;