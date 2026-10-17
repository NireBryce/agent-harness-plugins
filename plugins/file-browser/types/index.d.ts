/** A path relative to the working directory; '' is its root, or no file. */
export type FileBrowserPath = string

declare module 'claude-code' {
  interface PluginState {
    'file-browser': {
      /** The directory shown. */
      dir: FileBrowserPath
      /** The file previewed over the listing; '' while listing. */
      file: FileBrowserPath
      /** Whether dotfiles are listed (.git never is). */
      showHidden: boolean
    }
  }
}
