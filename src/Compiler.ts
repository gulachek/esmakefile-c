import { Cookbook, IBuildPath, Path } from 'gulpachek';

export type CVersion = 'C89' | 'C99' | 'C11' | 'C17';

export interface ICTranslationUnit {
	src: Path;
	cVersion: CVersion;
	includePaths: string[];
	definitions: Record<string, string>;
}

/**
 * C compiler for building C libraries
 * and executables
 */
export interface ICCompiler {
	/** Compile and link a C executable */
	addCExecutable(book: Cookbook, opts: ICExecutableOpts): void;
}

export interface ICExecutableOpts {
	output: IBuildPath;
	src: ICTranslationUnit[];
}
