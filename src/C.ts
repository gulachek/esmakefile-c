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
	IExecutableOpts,
	ILibraryOpts,
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
	public addCompileCommands(): IBuildPath {
		return this._compiler.addCompileCommands(this._book);
	}

	public addExecutable(opts: IAddExecutableOpts): IBuildPath {
		return this._compiler.addExecutable(this._book, this._normalizeOpts(opts));
	}

	public addLibrary(opts: IAddLibraryOpts): IBuildPath {
		return this._compiler.addLibrary(this._book, this._normalizeOpts(opts));
	}

	private _normalizeOpts(opts: IAddLibraryOpts): ILibraryOpts;
	private _normalizeOpts(opts: IAddExecutableOpts): IExecutableOpts;
	private _normalizeOpts(
		opts: IAddLibraryOpts | IAddExecutableOpts,
	): ILibraryOpts | IExecutableOpts {
		const { name } = opts;
		const version = 'version' in opts ? opts.version : undefined;

		const outputDirectory = Path.build(opts.outputDirectory || '/');

		const includes = new Set<string>();
		const rawIncludesPaths = opts.includePaths || ['include'];
		for (const i of rawIncludesPaths) {
			includes.add(this._book.abs(Path.src(i)));
		}

		const exportIncludes = new Set<string>(includes);

		if ('privateIncludes' in opts && opts.privateIncludes) {
			const privateIncludes = opts.privateIncludes;
			for (const i of privateIncludes) {
				includes.add(this._book.abs(Path.src(i)));
			}
		}

		const defs = { ...opts.definitions } || {};
		if (!('DEBUG' in defs || 'NDEBUG' in defs)) {
			if (this._isDebug) {
				defs.DEBUG = '';
			} else {
				defs.NDEBUG = '';
			}
		}

		if ('privateDefinitions' in opts && opts.privateDefinitions) {
			for (const def in opts.privateDefinitions) {
				defs[def] = opts.privateDefinitions[def];
			}
		}

		const pch = opts.precompiledHeader && Path.src(opts.precompiledHeader);

		const src = opts.src.map((s) =>
			this._makeTranslationUnit(s, includes, defs, pch),
		);

		return {
			name,
			version,
			outputDirectory,
			src,
			runtime: this._runtimeLang(src),
			includePaths: exportIncludes,
			definitions: opts.definitions,
			link: opts.link || [],
			isDebug: this._isDebug,
		};
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
		precompiledHeader?: Path,
	): TranslationUnit {
		const srcPath = Path.src(src);

		const base = {
			src: srcPath,
			includePaths: includes,
			definitions: defs,
			precompiledHeader,
		};

		if (srcPath.extname === '.c') {
			if (!this._cVersion) {
				throw new Error(
					`Source file ${srcPath} is a C file but no cVersion was given to the build system`,
				);
			}

			return {
				...base,
				cVersion: this._cVersion,
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
			...base,
			cxxVersion: this._cxxVersion,
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
	precompiledHeader?: PathLike;
}

export interface IAddLibraryOpts extends IAddExecutableOpts {
	version: string;
	privateDefinitions?: Record<string, string>;
	privateIncludes?: Iterable<PathLike>;
}
