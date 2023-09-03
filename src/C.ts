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
		const src = opts.src.map((s) => this._makeTranslationUnit(s));
		this._compiler.addCExecutable(this._book, {
			output,
			src,
		});
	}

	private _makeTranslationUnit(src: PathLike): ICTranslationUnit {
		return {
			src: Path.src(src),
			cVersion: this._cVersion,
			includePaths: [],
			definitions: {},
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
}
