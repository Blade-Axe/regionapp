import { useEffect, useState } from "react";
import { Link } from "react-router";
import Head from "./Head";

type Status = {
	online: boolean;
	motd: string;
    motdHtml: string;
	version: string;
	players: {
        online: number;
        max: number;
        list: { name: string; uuid: string; skin: string | null }[];
    };
};

function MinecraftStatus() {
	const [status, setStatus] = useState<Status | null>(null);
	const [error, setError] = useState(false);

	useEffect(() => {
        let ws: WebSocket | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let stopped = false;

        const connect = () => {
            const protocol = location.protocol === "https:" ? "wss" : "ws";
            ws = new WebSocket(`${protocol}://${location.host}/api/minecraft/live`);

            ws.onopen = () => setError(false);
            ws.onmessage = (event) => setStatus(JSON.parse(event.data) as Status);
            ws.onerror = () => {
                if (!stopped) setError(true);
            };
            ws.onclose = () => {
                if (!stopped) timer = setTimeout(connect, 3000);
            };
        };

        connect();

        return () => {
            stopped = true;
            clearTimeout(timer);
            ws?.close();
        };
    }, []);

	if (error && !status) {
        return <div className="mc-status">Status is not available.</div>;
    }
	if (!status) return <div className="mc-status">Loading status...</div>;
	if (!status.online) {
		return <div className="mc-status">Server is offline.</div>;
	}

	return (
		<div className="mc-status">
			{status.motdHtml ? (
                <p
                    className="mc-motd"
                    dangerouslySetInnerHTML={{ __html: status.motdHtml }}
                />
            ) : (
                <p className="mc-motd">{status.motd}</p>
                
            )}
            <p>
                Players: {status.players.online} / {status.players.max}
            </p>
			{status.players.list.length > 0 && (
                <ul className="mc-players">
                    {status.players.list.map((player) => (
                        <li key={player.uuid}>
                            <div className="lb-player">
                                <Head src={player.skin ? `/api/skin/${player.skin}` : null} />
                                <Link
                                    to={`/user/${encodeURIComponent(player.name)}`}
                                    className="lb-name"
                                >
                                    {player.name}
                                </Link>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
		</div>
	);
}

export default MinecraftStatus;