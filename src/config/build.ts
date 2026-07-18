export const PUBLIC_BUILD = {
  application: 'Coco DEX',
  environment: __APP_ENV__,
  gitCommitSha: __GIT_COMMIT_SHA__,
  timestamp: __BUILD_TIMESTAMP__,
  version: __APP_VERSION__,
} as const

export function shortCommitSha(sha = PUBLIC_BUILD.gitCommitSha) {
  return sha === 'unknown' ? sha : sha.slice(0, 7)
}
