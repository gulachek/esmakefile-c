import {
	BuildPathLike,
	Cookbook,
	Path,
	PathLike,
	IBuildPath,
} from 'esmakefile';
import {
	CVersion,
	ICCompiler,
	ICTranslationUnit,
	Linkable,
} from './Compiler.js';

export class C<TCompiler extends ICCompiler> {
	private _book: Cookbook;
	private _compiler: TCompiler;
	private _cVersion: CVersion;

	constructor(compiler: TCompiler, opts: ICOpts) {
		this._book = opts.book;
		this._compiler = compiler;
		this._cVersion = opts.cVersion;
	}

	// TODO - this shouldn't be necessary. Should be able to dynamicall
	// add dependencies
	public addCompileCommands(): void {
		this._compiler.addCompileCommands(this._book);
	}

	public addExecutable(opts: IAddExecutableOpts): void {
		const output = Path.build(opts.outputDirectory || '/').join(opts.name);

		const includes = new Set<string>();
		const rawIncludesPaths = opts.includePaths || ['include'];
		for (const i of rawIncludesPaths) {
			includes.add(this._book.abs(Path.src(i)));
		}

		const defs = opts.definitions || {};

		const src = opts.src.map((s) =>
			this._makeTranslationUnit(s, includes, defs),
		);

		this._compiler.addCExecutable(this._book, {
			output,
			src,
			link: opts.link || [],
		});
	}

	public addLibrary(opts: IAddLibraryOpts): IBuildPath {
		const { name, version } = opts;
		const outputDirectory = Path.build(opts.outputDirectory || '/');

		const includes = new Set<string>();
		const rawIncludesPaths = opts.includePaths || ['include'];
		for (const i of rawIncludesPaths) {
			includes.add(this._book.abs(Path.src(i)));
		}

		const defs = opts.definitions || {};

		const src = opts.src.map((s) =>
			this._makeTranslationUnit(s, includes, defs),
		);

		return this._compiler.addCLibrary(this._book, {
			name,
			version,
			outputDirectory,
			src,
			includePaths: includes,
			definitions: defs,
			cVersion: this._cVersion,
			link: opts.link || [],
		});
	}

	private _makeTranslationUnit(
		src: PathLike,
		includes: Set<string>,
		defs: Record<string, string>,
	): ICTranslationUnit {
		return {
			src: Path.src(src),
			cVersion: this._cVersion,
			includePaths: includes,
			definitions: defs,
		};
	}
}

export interface ICOpts {
	book: Cookbook;
	cVersion: CVersion;
}

export interface IAddExecutableOpts {
	name: string;
	outputDirectory?: BuildPathLike;
	src: PathLike[];

	/** default ['include'] */
	includePaths?: Iterable<PathLike>;

	definitions?: Record<string, string>;

	link?: Linkable[];
}

export interface IAddLibraryOpts {
	name: string;
	version: string;
	outputDirectory?: BuildPathLike;
	src: PathLike[];

	includePaths?: Iterable<PathLike>;
	definitions?: Record<string, string>;
	link?: Linkable[];
}
