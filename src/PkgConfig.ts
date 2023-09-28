import { ChildProcess, spawn } from 'node:child_process';
import { Writable } from 'node:stream';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { Cookbook, IRecipe, Path, RecipeBuildArgs } from 'gulpachek';
import { platform } from 'node:os';

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

interface IPackageOpts {
	packageName: string;
	version: string;
	name?: string;
	description?: string;
	cflags?: string;
	libs?: string;
}

class PackageRecipe implements IRecipe {
	private _packageName: string;
	private _name: string;
	private _version: string;
	private _cflags?: string;
	private _libs?: string;
	private _description?: string;

	constructor(opts: IPackageOpts) {
		this._packageName = opts.packageName;
		this._name = opts.name || opts.packageName;
		this._description = opts.description;
		this._version = opts.version;
		this._cflags = opts.cflags;
		this._libs = opts.libs;
	}

	targets() {
		return Path.build(`pkgconfig/${this._packageName}.pc`);
	}

	async buildAsync(args: RecipeBuildArgs): Promise<boolean> {
		const { targets } = args.paths<PackageRecipe>();
		const lines = [
			`Name: ${this._name}`,
			`Version: ${this._version}`,
			`Description: ${this._description || '(no description)'}`,
		];

		if (this._cflags) lines.push(`Cflags: ${this._cflags}`);
		if (this._libs) lines.push(`Libs: ${this._libs}`);

		await writeFile(targets, lines.join('\n'), 'utf8');
		return true;
	}
}

export class PkgConfig {
	private _book: Cookbook;

	private _jsonPath: string;
	private _localModsPath: string;
	private _jsonObj: Promise<IPackageConfigJson> | null = null;

	constructor(book: Cookbook) {
		const { srcRoot, buildRoot } = book;
		this._book = book;
		this._jsonPath = join(srcRoot, 'pkgconfig.json');

		const sep = platform() === 'win32' ? ';' : ':';
		this._localModsPath = [buildRoot, srcRoot]
			.map((s) => join(s, 'pkgconfig'))
			.join(sep);
	}

	public addPackage(opts: IPackageOpts): void {
		this._book.add(new PackageRecipe(opts));
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
			env: {
				...process.env,
				PKG_CONFIG_PATH: this._localModsPath,
			},
		});

		return waitStreams(proc);
	}

	/** name -> name + version constraint */
	private async query(names: string[]): Promise<string[]> {
		const obj = await this.jsonObj();
		return names.map((n) => this.nameToVersionedName(n, obj));
	}

	private jsonObj(): Promise<IPackageConfigJson> {
		if (this._jsonObj) return this._jsonObj;

		this._jsonObj = new Promise<IPackageConfigJson>(async (res) => {
			const contents = await readFile(this._jsonPath, 'utf8');
			res(JSON.parse(contents) as IPackageConfigJson);
		});

		return this._jsonObj;
	}

	private hasTargetPackage(name: string): boolean {
		// TODO - add a hasTarget
		const targets = this._book.targets();
		return targets.indexOf(`pkgconfig/${name}.pc`) !== -1;
	}

	private nameToVersionedName(name: string, json: IPackageConfigJson): string {
		if (this.hasTargetPackage(name)) return name;

		const version = json.dependencies[name];

		if (!version) {
			throw new Error(
				`'${name}' is not listed as a dependency in pkgconfig.json`,
			);
		}

		return `${name} ${version}`;
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
