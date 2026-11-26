import { useEffect, useMemo, useState } from "react";
import Head from "../components/Head";
import { Link } from "react-router";

type Kind = "time" | "distance" | "tenths" | "count";
type Meta = { key: string; label: string; group: string; kind: Kind };
type Row = { uuid: string; name: string; skin: string | null; values: number[] };
type Board = { columns: Meta[]; rows: Row[] };
type PickerTarget = { index: number | null };

const STORAGE_KEY = "lb-columns";
const MAX_COLUMNS = 5;

const formatTicks = (ticks: number) => {
	const minutes = Math.floor(ticks / 20 / 60);
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

function formatMetric(kind: Kind, value: number) {
	if (kind === "time") return formatTicks(value);
	if (kind === "distance") return `${(value / 100000).toFixed(2)} km`;
	if (kind === "tenths") return (value / 10).toFixed(1);
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
			{query !== "" && results.length >= 100 && (
				<p className="lb-group">Only the first 100 results show. Type more to narrow them.</p>
			)}
			{query !== "" && results.length === 0 && (
				<p className="lb-group">No statistic found.</p>
			)}
		</div>
	);
}

function Stats() {
	const [custom, setCustom] = useState<string[] | null>(loadColumns);
	const [dir, setDir] = useState<"desc" | "asc">("desc");
	const [sort, setSort] = useState<string | null>(null);
	const [board, setBoard] = useState<Board | null>(null);
	const [error, setError] = useState(false);
	const [picker, setPicker] = useState<PickerTarget | null>(null);

	useEffect(() => {
		const params = new URLSearchParams();
		if (custom) params.set("columns", custom.join(","));

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
	}, [custom]);

	// The sort key is a choice of the visitor. If it is not a column, use the first column.
	const sortKey =
		board && sort && board.columns.some((c) => c.key === sort)
			? sort
			: (board?.columns[0]?.key ?? null);

	// The browser sorts the rows. A click on a header makes no request.
	const sortedRows = useMemo(() => {
		if (!board || !sortKey) return [];
		const index = board.columns.findIndex((c) => c.key === sortKey);
		const sign = dir === "desc" ? 1 : -1;
		return [...board.rows].sort(
			(a, b) =>
				sign * (b.values[index] - a.values[index]) || a.name.localeCompare(b.name),
		);
	}, [board, sortKey, dir]);

	const sortBy = (key: string) => {
		if (key === sortKey) {
			setDir((d) => (d === "desc" ? "asc" : "desc"));
		} else {
			setSort(key);
			setDir("desc");
		}
	};

	const updateColumns = (next: string[] | null) => {
		try {
			if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
			else localStorage.removeItem(STORAGE_KEY);
		} catch {
			// Storage is not available. The choice lasts until the page closes.
		}
		if (!next || (sort && !next.includes(sort))) {
			setSort(null);
			setDir("desc");
		}
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
									<th
										key={col.key}
										aria-sort={
											sortKey === col.key ? (dir === "desc" ? "descending" : "ascending") : "none"
										}
									>
										<button
											className={`lb-sort${sortKey === col.key ? " active" : ""}`}
											onClick={() => sortBy(col.key)}
										>
											{col.label}{" "}
											{sortKey === col.key ? (dir === "desc" ? <i className="hn hn-angle-down"></i> : <i className="hn hn-angle-up"></i>) : "-"}
										</button>
										<button
											className="lb-tool"
											aria-label={`Change ${col.label}`}
											onClick={() => setPicker({ index: i })}
										>
											[Edit]
										</button>
										{board.columns.length > 1 && (
											<button
												className="lb-tool"
												aria-label={`Remove ${col.label}`}
												onClick={() => remove(i)}
											>
												[×]
											</button>
										)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{sortedRows.map((row, index) => (
								<tr key={row.uuid}>
									<td>{dir === "desc" ? index + 1 : sortedRows.length - index}</td>
									<td>
										<div className="lb-player">
											<Head src={row.skin ? `/api/skin/${row.skin}` : `/api/head/${row.uuid}`} />
											<Link to={`/user/${encodeURIComponent(row.name)}`} className="lb-name">
												{row.name}
											</Link>
										</div>
									</td>
									{row.values.map((value, i) => (
										<td key={board.columns[i].key}>
											{formatMetric(board.columns[i].kind, value)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</>
	);
}

export default Stats;