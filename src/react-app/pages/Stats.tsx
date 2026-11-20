import { Fragment, useEffect, useState } from "react";

type Row = {
	uuid: string;
	name: string;
	playTicks: number;
	days: number;
	deaths: number;
	mobKills: number;
	blocksMined: number;
	distanceCm: number;
};

type Detail = { name: string; stats: Record<string, Record<string, number>> };

const SORTS = [
	["playtime", "Play time"],
	["deaths", "Deaths"],
	["mobs", "Mob kills"],
	["mined", "Blocks mined"],
	["distance", "Distance"],
] as const;

type SortKey = (typeof SORTS)[number][0];

const formatTicks = (ticks: number) => {
	const minutes = Math.floor(ticks / 20 / 60);
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const pretty = (key: string) => key.replace("minecraft:", "").replace(/_/g, " ");

function formatValue(key: string, value: number) {
	if (key.endsWith("_one_cm")) return `${(value / 100000).toFixed(2)} km`;
	if (key.includes("time") || key.endsWith("play_one_minute")) {
		return formatTicks(value);
	}
	return value.toLocaleString();
}

function Stats() {
	const [sort, setSort] = useState<SortKey>("playtime");
	const [rows, setRows] = useState<Row[] | null>(null);
	const [error, setError] = useState(false);
	const [open, setOpen] = useState<string | null>(null);
	const [detail, setDetail] = useState<Detail | null>(null);

	useEffect(() => {
		fetch(`/api/leaderboard?sort=${sort}`)
			.then((res) => {
				if (!res.ok) throw new Error("Bad response");
				return res.json() as Promise<Row[]>;
			})
			.then((data) => {
				setRows(data);
				setError(false);
			})
			.catch(() => setError(true));
	}, [sort]);

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

	if (error) return <p>Leaderboard is not available.</p>;
	if (!rows) return <p>Loading leaderboard...</p>;
	if (rows.length === 0) return <p>No player data yet.</p>;

	return (
		<>
			<h1 className="lb-title">Leaderboard</h1>
			<div className="lb-wrap">
				<table className="lb">
					<thead>
						<tr>
							<th>#</th>
							<th>Player</th>
							{SORTS.map(([key, label]) => (
								<Fragment key={key}>
									<th>
										<button
											className={`lb-sort${sort === key ? " active" : ""}`}
											onClick={() => setSort(key)}
										>
											{label}
										</button>
									</th>
									{key === "playtime" && <th>In-game days</th>}
								</Fragment>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((row, index) => (
							<Fragment key={row.uuid}>
								<tr>
									<td>{index + 1}</td>
									<td>
										<button className="lb-name" onClick={() => toggle(row.uuid)}>
											{row.name}
										</button>
									</td>
									<td>{formatTicks(row.playTicks)}</td>
									<td>{row.days}</td>
									<td>{row.deaths.toLocaleString()}</td>
									<td>{row.mobKills.toLocaleString()}</td>
									<td>{row.blocksMined.toLocaleString()}</td>
									<td>{(row.distanceCm / 100000).toFixed(1)} km</td>
								</tr>
								{open === row.uuid && (
									<tr>
										<td colSpan={8} className="lb-detail">
											{!detail
												? "Loading..."
												: Object.entries(detail.stats).map(([category, entries]) => (
														<details key={category}>
															<summary>
																{pretty(category)} ({Object.keys(entries).length})
															</summary>
															<table className="lb-inner">
																<tbody>
																	{Object.entries(entries)
																		.sort(([, a], [, b]) => b - a)
																		.map(([key, value]) => (
																			<tr key={key}>
																				<td>{pretty(key)}</td>
																				<td>{formatValue(key, value)}</td>
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
		</>
	);
}

export default Stats;