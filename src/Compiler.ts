import { Cookbook, IBuildPath, Path } from 'gulpachek';

export type CVersion = 'C89' | 'C99' | 'C11' | 'C17';

export type Linkable = string | IBuildPath;

export interface ICTranslationUnit {
	src: Path;
	cVersion: CVersion;
	includePaths: Set<string>;
	definitions: Record<string, string>;
}

/**
 * C compiler for building C libraries
 * and executables
 */
export interface ICCompiler<
	TLibraryOpts extends ICLibraryOpts = ICLibraryOpts,
> {
	/** Compile and link a C executable */
	addCExecutable(book: Cookbook, opts: ICExecutableOpts): void;

	/** Compile and link a C library */
	addCLibrary(book: Cookbook, opts: TLibraryOpts): IBuildPath;

	addCompileCommands(book: Cookbook): void;
}

export interface ICExecutableOpts {
	output: IBuildPath;
	src: ICTranslationUnit[];
	link: Linkable[];
}

export interface ICLibraryOpts {
	name: string;
	version: string;
	outputDirectory: IBuildPath;
	src: ICTranslationUnit[];
	link: Linkable[];

	// API
	includePaths: Set<string>;
	cVersion: CVersion;
	definitions: Record<string, string>;
}

export interface ICLibraryInterface {
	/**  paths for consumer to include */
	includePaths: Set<string>;

	/** definitions for consumer to define */
	definitions: Record<string, string>;

	/** C version that consumer must be compatible with to include headers */
	cVersion: CVersion;
}
