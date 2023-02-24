import * as path from "path";
import {
  DockerImageAsset,
  NetworkMode,
  Platform,
} from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

export const createNginxAndVectorECRImages = (
  scope: Construct,
  platform: Platform
) => {
  console.log("NginxAndVectorECRImages platform:" + platform.platform);
  const nginxImage = new DockerImageAsset(scope, `nginx-${platform}`, {
    directory: path.join(__dirname, "./images/nginx"),
    file: `Dockerfile`,
    networkMode: NetworkMode.HOST,
    buildArgs: {
      PLATFORM_ARG: platform.platform,
    },
    platform,
  });

  const vectorImage = new DockerImageAsset(scope, `vector-${platform}`, {
    directory: path.join(__dirname, "./images/vector"),
    file: `Dockerfile`,
    networkMode: NetworkMode.HOST,
    buildArgs: {
      PLATFORM_ARG: platform.platform,
    },
    platform,
  });

  return {
    nginxImage: ecs.ContainerImage.fromDockerImageAsset(nginxImage),
    vectorImage: ecs.ContainerImage.fromDockerImageAsset(vectorImage),
  };
};

export const createNginxLuaECRImage = (
  scope: Construct,
  platform: Platform
) => {
  console.log("NginxLuaECRImage platform:" + platform.platform);
  const nginxLuaImage = new DockerImageAsset(scope, `nginxLua-${platform}`, {
    directory: path.join(__dirname, "./images/nginx-lua"),
    file: `Dockerfile`,
    networkMode: NetworkMode.HOST,
    buildArgs: {
      PLATFORM_ARG: platform.platform,
    },
    platform,
  });

  return {
    nginxLuaImage: ecs.ContainerImage.fromDockerImageAsset(nginxLuaImage),
  };
};

export const createJavaServerECRImage = (
  scope: Construct,
  platform: Platform
) => {
  console.log("createJavaServerECRImage platform:" + platform.platform);
  const image = new DockerImageAsset(scope, `javaServer-${platform}`, {
    directory: path.join(__dirname, "./images/java-server"),
    file: `Dockerfile`,
    networkMode: NetworkMode.HOST,
    buildArgs: {
      PLATFORM_ARG: platform.platform,
    },
    platform,
  });

  return {
    javaServerImage: ecs.ContainerImage.fromDockerImageAsset(image),
  };
};

export const createNginxLogECRImage = (
  scope: Construct,
  platform: Platform
) => {
  console.log("NginxLogECRImage platform:" + platform.platform);
  const nginxLogImage = new DockerImageAsset(scope, `nginxLog-${platform}`, {
    directory: path.join(__dirname, "./images/nginx-log"),
    file: `Dockerfile`,
    networkMode: NetworkMode.HOST,
    buildArgs: {
      PLATFORM_ARG: platform.platform,
    },
    platform,
  });

  return {
    nginxLogImage: ecs.ContainerImage.fromDockerImageAsset(nginxLogImage),
  };
};

export const createAlbLoginLambdaImage = (scope: Construct) => {
  return lambda.DockerImageCode.fromImageAsset(
    path.join(__dirname, "./lambda/login-token"),
    {
      file: "Dockerfile",
    }
  );
};
