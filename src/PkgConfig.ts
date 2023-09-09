import { ChildProcess, spawn } from 'node:child_process';
import { Writable } from 'node:stream';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

export type PkgConfigSuccess<T> = {
	value: T;
};

export type PkgConfigFailure = {
	stderr: string;
};

export type PkgConfigResult<T> = PkgConfigSuccess<T> | PkgConfigFailure;

// workaround typescript bug that can't differentiate true/false in
// if/then. don't feel like writing up an issue but this is cleaner
// than comparing if (result.success === true) { success } else { failure }
export function isFailure<T>(
	result: PkgConfigResult<T>,
): result is PkgConfigFailure {
	return 'stderr' in result;
}

export type PkgConfigFlags = PkgConfigResult<string[]>;

interface IPackageConfigJson {
	/** name -> version constraint */
	dependencies: Record<string, string>;
}

export class PkgConfig {
	private _dir: string;
	private _jsonPath: string;
	private _jsonObj: Promise<IPackageConfigJson> | null = null;

	constructor(dir: string) {
		this._dir = dir;
		this._jsonPath = join(dir, 'pkgconfig.json');
	}

	public libs(names: string[]): Promise<PkgConfigFlags> {
		return this.flags('--libs', names);
	}

	public cflags(names: string[]): Promise<PkgConfigFlags> {
		return this.flags('--cflags', names);
	}

	private async flags(
		shellFlag: string,
		names: string[],
	): Promise<PkgConfigFlags> {
		const queries = await this.query(names);

		const { success, stdout, stderr } = await this.spawn([
			shellFlag,
			...queries,
		]);
		if (!success) {
			return { stderr };
		}

		const flags = stdout.split(/\s+/);
		return { value: flags };
	}

	private async spawn(args: string[]): Promise<IProcExit> {
		const proc = spawn('pkg-config', args, {
			stdio: 'pipe',
		});

		return waitStreams(proc);
	}

	/** name -> name + version constraint */
	private async query(names: string[]): Promise<string[]> {
		const obj = await this.jsonObj();
		return names.map((n) => nameToVersionedName(n, obj));
	}

	private jsonObj(): Promise<IPackageConfigJson> {
		if (this._jsonObj) return this._jsonObj;

		this._jsonObj = new Promise<IPackageConfigJson>(async (res) => {
			const contents = await readFile(this._jsonPath, 'utf8');
			res(JSON.parse(contents) as IPackageConfigJson);
		});

		return this._jsonObj;
	}
}

interface IProcExit {
	success: boolean;
	stdout: string;
	stderr: string;
}

async function waitStreams(proc: ChildProcess): Promise<IProcExit> {
	const stdout = new StringBuffer();
	const stderr = new StringBuffer();
	proc.stdout.pipe(stdout);
	proc.stderr.pipe(stderr);
	const success = await waitClose(proc);
	return { stdout: stdout.str(), stderr: stderr.str(), success };
}

function waitClose(proc: ChildProcess): Promise<boolean> {
	return new Promise<boolean>((res) => {
		proc.on('close', (code) => {
			res(code === 0);
		});
	});
}

class StringBuffer extends Writable {
	private _chunks: Buffer[] = [];

	override _write(
		chunk: Buffer,
		_encoding: BufferEncoding,
		cb: (error?: Error) => void,
	) {
		this._chunks.push(chunk);
		cb();
	}

	public str(): string {
		return Buffer.concat(this._chunks).toString();
	}
}

function nameToVersionedName(name: string, json: IPackageConfigJson): string {
	const version = json.dependencies[name];

	if (!version) {
		throw new Error(
			`'${name}' is not listed as a dependency in pkgconfig.json`,
		);
	}

	return `${name} ${version}`;
}
