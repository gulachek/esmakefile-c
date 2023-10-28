import {
	BuildPathLike,
	Cookbook,
	Path,
	PathLike,
	IBuildPath,
} from 'esmakefile';
import {
	CVersion,
	CxxVersion,
	ICompiler,
	isC,
	Linkable,
	RuntimeLanguage,
	TranslationUnit,
} from './Compiler.js';

export class C<TCompiler extends ICompiler> {
	private _book: Cookbook;
	private _compiler: TCompiler;
	private _cVersion: CVersion | null;
	private _cxxVersion: CxxVersion | null;
	private _isDebug: boolean;

	constructor(compiler: TCompiler, opts: ICOpts | ICxxOpts) {
		this._book = opts.book;
		this._isDebug = opts.isDevelopment;
		this._compiler = compiler;
		this._cVersion = opts.cVersion || null;
		this._cxxVersion = opts.cxxVersion || null;
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

		this._compiler.addExecutable(this._book, {
			output,
			src,
			isDebug: this._isDebug,
			runtime: this._runtimeLang(src),
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

		return this._compiler.addLibrary(this._book, {
			name,
			version,
			outputDirectory,
			src,
			runtime: this._runtimeLang(src),
			includePaths: includes,
			definitions: defs,
			cVersion: this._cVersion,
			link: opts.link || [],
			isDebug: this._isDebug,
		});
	}

	private _runtimeLang(tus: TranslationUnit[]): RuntimeLanguage {
		for (const tu of tus) {
			if (!isC(tu)) return 'C++';
		}

		return 'C';
	}

	private _makeTranslationUnit(
		src: PathLike,
		includes: Set<string>,
		defs: Record<string, string>,
	): TranslationUnit {
		const srcPath = Path.src(src);
		if (srcPath.extname === '.c') {
			if (!this._cVersion) {
				throw new Error(
					`Source file ${srcPath} is a C file but no cVersion was given to the build system`,
				);
			}

			return {
				src: srcPath,
				cVersion: this._cVersion,
				includePaths: includes,
				definitions: defs,
			};
		}

		switch (srcPath.extname) {
			case '.cpp':
			case '.cxx':
			case '.cc':
				break;
			default:
				throw new Error(
					`${srcPath} has a file extension that is not recognized by the system`,
				);
		}

		if (!this._cxxVersion) {
			throw new Error(
				`Source file ${srcPath} is a C++ file but no cxxVersion was given to the build system`,
			);
		}

		return {
			src: srcPath,
			cxxVersion: this._cxxVersion,
			includePaths: includes,
			definitions: defs,
		};
	}
}

export interface IBaseCOpts {
	book: Cookbook;
	isDevelopment: boolean;
	cVersion?: CVersion;
	cxxVersion: CxxVersion;
}

export interface ICOpts extends IBaseCOpts {
	cVersion: CVersion;
}

export interface ICxxOpts extends IBaseCOpts {
	cxxVersion: CxxVersion;
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
