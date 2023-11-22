#!/usr/bin/env node

import cdk, {aws_appsync, aws_certificatemanager, aws_route53} from "aws-cdk-lib";
import { Route53Client, GetHostedZoneCommand } from "@aws-sdk/client-route-53";

const hostedZoneId = process.env.HOSTED_ZONE_ID;
const domain = await (async () => {
	const res = await new Route53Client().send(new GetHostedZoneCommand({Id: hostedZoneId}));
	return res.HostedZone.Name.replace(/\.$/, "");
})();

console.log(hostedZoneId, domain);

const app = new cdk.App();
const stack1 = new cdk.Stack(app, "Stack1", {env: {region: "eu-west-1"}, crossRegionReferences: true});
const stack2 = new cdk.Stack(app, "Stack2", {env: {region: "us-east-1"}, crossRegionReferences: true});

const hostedZoneStack2 = aws_route53.HostedZone.fromHostedZoneAttributes(stack2, "HostedZone", {hostedZoneId: hostedZoneId, zoneName: domain});

const crossRegionCertificate = new aws_certificatemanager.Certificate(stack2, 'crossRegionCertificate', {
	domainName: "api." + domain,
	validation: aws_certificatemanager.CertificateValidation.fromDns(hostedZoneStack2),
});

const hostedZoneStack1 = aws_route53.HostedZone.fromHostedZoneAttributes(stack1, "HostedZone", {hostedZoneId: hostedZoneId, zoneName: domain});

const dnsValidatedCertificate = new aws_certificatemanager.DnsValidatedCertificate(stack1, "DnsValidatedCertificate", {
	domainName: "api." + domain,
	hostedZone: hostedZoneStack1,
	region: "us-east-1",
	validation: aws_certificatemanager.CertificateValidation.fromDns(hostedZoneStack1),
});

const appsyncDomain = new aws_appsync.CfnDomainName(stack1, "AppSyncDomain", {
	//certificateArn: dnsValidatedCertificate.certificateArn,
	certificateArn: crossRegionCertificate.certificateArn,
	domainName: "api." + domain,
});

const appsyncApi = new aws_appsync.CfnGraphQLApi(stack1, "AppSyncApi", {
	authenticationType: "API_KEY",
	name: "testing",
});

new aws_appsync.CfnDomainNameApiAssociation(stack1, "AppSyncDomainAssociation", {
	apiId: appsyncApi.attrApiId,
	domainName: appsyncDomain.attrDomainName,
});

new aws_route53.CnameRecord(stack1, "Cname", {
	recordName: "api",
	zone: hostedZoneStack1,
	domainName: appsyncDomain.attrAppSyncDomainName,
})

