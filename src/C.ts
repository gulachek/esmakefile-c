import { BuildPathLike, Cookbook, Path, PathLike } from 'gulpachek';
import { AppleClang } from './AppleClang.js';
import { CVersion, ICCompiler, ICTranslationUnit } from './Compiler.js';

export class C {
	private _book: Cookbook;
	private _compiler: ICCompiler;
	private _cVersion: CVersion;

	constructor(opts: ICOpts) {
		this._book = opts.book;
		this._compiler = new AppleClang();
		this._cVersion = opts.cVersion;
	}

	public addExecutable(opts: IAddExecutableOpts): void {
		const output = Path.build(opts.output);

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
	output: BuildPathLike;
	src: PathLike[];

	/** default ['include'] */
	includePaths?: Iterable<PathLike>;

	definitions?: Record<string, string>;
}
